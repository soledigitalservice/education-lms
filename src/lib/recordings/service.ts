import {
  AuditAction,
  EnrollmentStatus,
  LiveSessionStatus,
  Prisma,
  RecordingStatus,
  Role,
  type PrismaClient,
} from '@prisma/client';
import { EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk';

import { ApiError } from '../api/errors';
import { env, isLiveKitConfigured, isStorageConfigured } from '../env';
import { getEgressClient } from '../livekit/client';
import { presignDownload, BUCKET } from '../storage';
import type { CourseAuthCtx } from '../courses/service';

export interface RecordingDto {
  id: string;
  sessionId: string;
  sessionTitle: string;
  courseId: string;
  status: RecordingStatus;
  durationSec: number | null;
  startedAt: string;
  endedAt: string | null;
  fileId: string | null;
  /** Short-lived signed download URL when status=READY. */
  downloadUrl: string | null;
}

export class RecordingsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- mutations -------------------------------------------------------

  /**
   * Host starts recording a LIVE session. Uses LiveKit Room Composite Egress
   * which encodes all visible video tiles + audio into one mp4 and uploads
   * it to our S3 bucket. The webhook updates the DB row to READY when done.
   */
  async startForSession(sessionId: string, ctx: CourseAuthCtx): Promise<RecordingDto> {
    if (!isLiveKitConfigured()) {
      throw ApiError.badRequest('LiveKit not configured');
    }
    if (!isStorageConfigured()) {
      throw ApiError.badRequest(
        'Object storage not configured — recordings need S3/R2 to upload to',
      );
    }
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { course: { select: { id: true, teacherId: true } } },
    });
    if (!session) throw ApiError.notFound('Session not found');
    if (ctx.role !== Role.ADMIN && session.hostId !== ctx.userId) {
      throw ApiError.forbidden('Only the host can start a recording');
    }
    if (session.status !== LiveSessionStatus.LIVE) {
      throw ApiError.badRequest('Session must be LIVE to start recording');
    }

    // Check if an in-flight recording exists.
    const existing = await this.prisma.recording.findFirst({
      where: { sessionId, status: RecordingStatus.PROCESSING },
    });
    if (existing) throw ApiError.conflict('A recording is already in progress for this session');

    // Build the S3 output. `s3.region` must be set even for non-AWS providers
    // (livekit-server-sdk passes it through to the AWS SDK in the Egress worker).
    const key = `recordings/${session.courseId}/${sessionId}/${Date.now()}.mp4`;
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: key,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: env.S3_ACCESS_KEY!,
          secret: env.S3_SECRET_KEY!,
          region: env.S3_REGION ?? 'auto',
          bucket: BUCKET(),
          endpoint: env.S3_ENDPOINT!,
          forcePathStyle: true,
        }),
      },
    });

    const egress = getEgressClient();
    const info = await egress.startRoomCompositeEgress(session.roomName, {
      file: output,
      // 720p layout — good balance between quality and bandwidth.
      layout: 'grid',
    });

    const created = await this.prisma.recording.create({
      data: {
        sessionId,
        status: RecordingStatus.PROCESSING,
        startedAt: new Date(),
        externalJobId: info.egressId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.CREATE,
        entity: 'Recording',
        entityId: created.id,
        metadata: { sessionId, egressId: info.egressId },
      },
    });
    return this.toDto(created, { sessionTitle: session.title, courseId: session.courseId });
  }

  /** Host requests stop of an in-flight recording. */
  async stopForSession(sessionId: string, ctx: CourseAuthCtx): Promise<void> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      select: { id: true, hostId: true, deletedAt: false },
    });
    if (!session) throw ApiError.notFound('Session not found');
    if (ctx.role !== Role.ADMIN && session.hostId !== ctx.userId) {
      throw ApiError.forbidden('Only the host can stop a recording');
    }
    const rec = await this.prisma.recording.findFirst({
      where: { sessionId, status: RecordingStatus.PROCESSING },
    });
    if (!rec || !rec.externalJobId) {
      throw ApiError.badRequest('No in-flight recording to stop');
    }
    const egress = getEgressClient();
    await egress.stopEgress(rec.externalJobId);
    // The webhook is what flips status to READY once the file is uploaded.
  }

  /**
   * Webhook handler. Looks up the Recording by `externalJobId`, marks it
   * READY with duration + creates the StoredFile row pointing at the
   * already-uploaded S3 object.
   */
  async handleEgressEnded(payload: {
    egressId: string;
    s3Key?: string | null;
    durationSec?: number | null;
    failed: boolean;
    failureReason?: string;
  }): Promise<void> {
    const rec = await this.prisma.recording.findFirst({
      where: { externalJobId: payload.egressId },
      include: { session: { select: { hostId: true } } },
    });
    if (!rec) return; // unknown egress — log and move on (we don't 4xx LiveKit)

    if (payload.failed || !payload.s3Key) {
      await this.prisma.recording.update({
        where: { id: rec.id },
        data: { status: RecordingStatus.FAILED, endedAt: new Date() },
      });
      // eslint-disable-next-line no-console
      console.warn(`Egress ${payload.egressId} failed: ${payload.failureReason ?? '(no reason)'}`);
      return;
    }

    // Create the StoredFile so existing presign / download endpoints work.
    const file = await this.prisma.storedFile.create({
      data: {
        key: payload.s3Key,
        bucket: BUCKET(),
        originalName: payload.s3Key.split('/').pop() ?? 'recording.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 0, // unknown until we HEAD it; fine for a v1
        uploaderId: rec.session.hostId,
      },
    });

    await this.prisma.recording.update({
      where: { id: rec.id },
      data: {
        status: RecordingStatus.READY,
        endedAt: new Date(),
        durationSec: payload.durationSec ?? null,
        fileId: file.id,
      },
    });
  }

  // ---- read ------------------------------------------------------------

  async listForSession(sessionId: string, ctx: CourseAuthCtx): Promise<RecordingDto[]> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { course: { select: { id: true, teacherId: true, deletedAt: true } } },
    });
    if (!session || session.course.deletedAt) throw ApiError.notFound('Session not found');
    await this.ensureCanReadRecordings(session.course, ctx);
    const rows = await this.prisma.recording.findMany({
      where: { sessionId },
      orderBy: { startedAt: 'desc' },
    });
    return Promise.all(
      rows.map((r) =>
        this.toDto(r, { sessionTitle: session.title, courseId: session.courseId }),
      ),
    );
  }

  async listForCourse(courseId: string, ctx: CourseAuthCtx): Promise<RecordingDto[]> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    await this.ensureCanReadRecordings(course, ctx);
    const rows = await this.prisma.recording.findMany({
      where: { session: { courseId } },
      include: { session: { select: { title: true, courseId: true } } },
      orderBy: { startedAt: 'desc' },
    });
    return Promise.all(
      rows.map((r) =>
        this.toDto(r, { sessionTitle: r.session.title, courseId: r.session.courseId }),
      ),
    );
  }

  /**
   * Parent-side: list all recordings of all courses any APPROVED-linked
   * child is enrolled in. Powers /api/me/children/:id/recordings.
   */
  async listForChild(childId: string, ctx: CourseAuthCtx): Promise<RecordingDto[]> {
    if (ctx.role === Role.ADMIN || ctx.userId === childId) {
      // Self or admin — list all recordings of any course the user is enrolled in.
    } else if (ctx.role === Role.PARENT) {
      const link = await this.prisma.parentChildLink.findUnique({
        where: { parentId_childId: { parentId: ctx.userId, childId } },
        select: { status: true },
      });
      if (!link || link.status !== 'APPROVED') {
        throw ApiError.forbidden('No approved link to that student');
      }
    } else {
      throw ApiError.forbidden('Not allowed');
    }

    const rows = await this.prisma.recording.findMany({
      where: {
        status: RecordingStatus.READY,
        session: {
          course: {
            enrollments: {
              some: {
                studentId: childId,
                status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
              },
            },
          },
        },
      },
      include: { session: { select: { title: true, courseId: true } } },
      orderBy: { startedAt: 'desc' },
    });
    return Promise.all(
      rows.map((r) =>
        this.toDto(r, { sessionTitle: r.session.title, courseId: r.session.courseId }),
      ),
    );
  }

  // ---- helpers ---------------------------------------------------------

  private async ensureCanReadRecordings(
    course: { id: string; teacherId: string },
    ctx: CourseAuthCtx,
  ): Promise<void> {
    if (ctx.role === Role.ADMIN || course.teacherId === ctx.userId) return;
    if (ctx.role === Role.STUDENT) {
      const enr = await this.prisma.enrollment.findFirst({
        where: {
          courseId: course.id,
          studentId: ctx.userId,
          status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
        },
        select: { id: true },
      });
      if (!enr) throw ApiError.forbidden('Not enrolled in this course');
      return;
    }
    if (ctx.role === Role.PARENT) {
      const link = await this.prisma.parentChildLink.findFirst({
        where: {
          parentId: ctx.userId,
          status: 'APPROVED',
          child: {
            enrollments: {
              some: {
                courseId: course.id,
                status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
              },
            },
          },
        },
        select: { id: true },
      });
      if (!link) throw ApiError.forbidden('No linked child in this course');
      return;
    }
    throw ApiError.forbidden('Not allowed');
  }

  private async toDto(
    row: {
      id: string;
      sessionId: string;
      status: RecordingStatus;
      durationSec: number | null;
      startedAt: Date;
      endedAt: Date | null;
      fileId: string | null;
    },
    extra: { sessionTitle: string; courseId: string },
  ): Promise<RecordingDto> {
    let downloadUrl: string | null = null;
    if (row.status === RecordingStatus.READY && row.fileId) {
      const file = await this.prisma.storedFile.findUnique({
        where: { id: row.fileId },
        select: { key: true, originalName: true },
      });
      if (file) {
        downloadUrl = env.S3_PUBLIC_URL
          ? `${env.S3_PUBLIC_URL.replace(/\/+$/, '')}/${file.key}`
          : await presignDownload({ key: file.key, downloadFilename: file.originalName });
      }
    }
    return {
      id: row.id,
      sessionId: row.sessionId,
      sessionTitle: extra.sessionTitle,
      courseId: extra.courseId,
      status: row.status,
      durationSec: row.durationSec,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      fileId: row.fileId,
      downloadUrl,
    };
  }
}
