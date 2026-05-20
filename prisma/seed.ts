/* eslint-disable no-console */
import {
  AccountStatus,
  ChatRoomKind,
  GradeScale,
  LessonType,
  LiveSessionStatus,
  MaterialType,
  PrismaClient,
  QuestionType,
  RecordingStatus,
  Role,
  SubmissionStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const env = (key: string, fallback: string): string => process.env[key] ?? fallback;

async function upsertUser(opts: {
  email: string;
  fullName: string;
  role: Role;
  status?: AccountStatus;
  password: string;
}): Promise<{ id: string; email: string; role: Role }> {
  const passwordHash = await argon2.hash(opts.password, ARGON2_OPTS);
  const user = await prisma.user.upsert({
    where: { email: opts.email.toLowerCase() },
    update: {
      fullName: opts.fullName,
      role: opts.role,
      status: opts.status ?? AccountStatus.ACTIVE,
    },
    create: {
      email: opts.email.toLowerCase(),
      passwordHash,
      fullName: opts.fullName,
      role: opts.role,
      status: opts.status ?? AccountStatus.ACTIVE,
      teacherProfile: opts.role === Role.TEACHER ? { create: {} } : undefined,
      studentProfile: opts.role === Role.STUDENT ? { create: {} } : undefined,
    },
  });
  return { id: user.id, email: user.email, role: user.role };
}

async function main(): Promise<void> {
  console.log('Seeding database...');

  const admin = await upsertUser({
    email: env('SEED_ADMIN_EMAIL', 'admin@education-lms.local'),
    fullName: env('SEED_ADMIN_NAME', 'Platform Admin'),
    role: Role.ADMIN,
    password: env('SEED_ADMIN_PASSWORD', 'ChangeMe123!'),
  });
  console.log(`  admin: ${admin.email}`);

  const teacher = await upsertUser({
    email: 'teacher@demo.local',
    fullName: 'Ana Profesora',
    role: Role.TEACHER,
    status: AccountStatus.ACTIVE,
    password: 'TeacherDemo123!',
  });
  const teacherPending = await upsertUser({
    email: 'teacher.pending@demo.local',
    fullName: 'Bruno Profesor Pendiente',
    role: Role.TEACHER,
    status: AccountStatus.PENDING_APPROVAL,
    password: 'TeacherDemo123!',
  });
  const student1 = await upsertUser({
    email: 'student1@demo.local',
    fullName: 'Carla Estudiante',
    role: Role.STUDENT,
    password: 'StudentDemo123!',
  });
  const student2 = await upsertUser({
    email: 'student2@demo.local',
    fullName: 'Diego Estudiante',
    role: Role.STUDENT,
    password: 'StudentDemo123!',
  });
  const parent = await upsertUser({
    email: 'parent@demo.local',
    fullName: 'Elena Madre',
    role: Role.PARENT,
    password: 'ParentDemo123!',
  });
  console.log('  demo users: teacher, pending-teacher, 2 students, 1 parent');

  // Parent → student1 link (already APPROVED in the seed for demo convenience).
  await prisma.parentChildLink.upsert({
    where: { parentId_childId: { parentId: parent.id, childId: student1.id } },
    update: { status: 'APPROVED', decidedAt: new Date(), decidedById: student1.id },
    create: {
      parentId: parent.id,
      childId: student1.id,
      status: 'APPROVED',
      decidedAt: new Date(),
      decidedById: student1.id,
    },
  });
  // Parent → student2 link (PENDING — student2 must approve it from /family).
  await prisma.parentChildLink.upsert({
    where: { parentId_childId: { parentId: parent.id, childId: student2.id } },
    update: {},
    create: {
      parentId: parent.id,
      childId: student2.id,
      status: 'PENDING',
      notes: 'Hola, soy tu padre — vincula nuestras cuentas para que pueda ver tus avances.',
      inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // Categories — small hierarchy: Mathematics (root) → Algebra, Geometry.
  const mathCat = await prisma.courseCategory.upsert({
    where: { slug: 'mathematics' },
    update: {},
    create: { name: 'Mathematics', slug: 'mathematics' },
  });
  const algebraCat = await prisma.courseCategory.upsert({
    where: { slug: 'algebra' },
    update: { parentId: mathCat.id },
    create: { name: 'Algebra', slug: 'algebra', parentId: mathCat.id },
  });
  await prisma.courseCategory.upsert({
    where: { slug: 'geometry' },
    update: { parentId: mathCat.id },
    create: { name: 'Geometry', slug: 'geometry', parentId: mathCat.id },
  });
  const scienceCat = await prisma.courseCategory.upsert({
    where: { slug: 'science' },
    update: {},
    create: { name: 'Science', slug: 'science' },
  });
  await prisma.courseCategory.upsert({
    where: { slug: 'languages' },
    update: {},
    create: { name: 'Languages', slug: 'languages' },
  });

  // Three courses: one PUBLISHED with approval, one PUBLISHED no-approval, one DRAFT.
  const course = await prisma.course.upsert({
    where: { slug: 'algebra-101' },
    update: {},
    create: {
      title: 'Algebra 101',
      slug: 'algebra-101',
      summary: 'Introduction to algebraic structures.',
      description: 'Variables, equations, polynomials and beginner proofs.',
      teacherId: teacher.id,
      categoryId: algebraCat.id,
      requiresApproval: true,
      publishedAt: new Date(),
    },
  });
  await prisma.course.upsert({
    where: { slug: 'intro-to-physics' },
    update: {},
    create: {
      title: 'Intro to Physics',
      slug: 'intro-to-physics',
      summary: 'Mechanics, energy, and the laws that govern everything around us.',
      description: 'A friendly introduction to classical mechanics with hands-on experiments.',
      teacherId: teacher.id,
      categoryId: scienceCat.id,
      requiresApproval: false, // direct enrollment
      maxStudents: 30,
      publishedAt: new Date(),
    },
  });
  await prisma.course.upsert({
    where: { slug: 'advanced-geometry' },
    update: {},
    create: {
      title: 'Advanced Geometry (draft)',
      slug: 'advanced-geometry',
      summary: 'Hyperbolic spaces, manifolds, and topology basics.',
      teacherId: teacher.id,
      categoryId: mathCat.id,
      requiresApproval: true,
      // No publishedAt → DRAFT (only the teacher owner sees it).
    },
  });

  const courseChatRoom = await prisma.chatRoom.upsert({
    where: { courseId: course.id },
    update: {},
    create: {
      kind: ChatRoomKind.COURSE,
      name: course.title,
      courseId: course.id,
      participants: {
        create: [{ userId: teacher.id }, { userId: student1.id }],
      },
    },
  });

  // Three demo messages so the chat room isn't empty on first load.
  const existingMsgCount = await prisma.message.count({
    where: { roomId: courseChatRoom.id },
  });
  if (existingMsgCount === 0) {
    await prisma.message.createMany({
      data: [
        {
          roomId: courseChatRoom.id,
          senderId: teacher.id,
          body: '¡Bienvenidos al curso de Algebra 101! Cualquier duda, escribid por aquí.',
          createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        },
        {
          roomId: courseChatRoom.id,
          senderId: student1.id,
          body: '¡Gracias profe! Una pregunta sobre la tarea: ¿podemos entregar en pareja?',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
        {
          roomId: courseChatRoom.id,
          senderId: teacher.id,
          body: 'No, en esta primera tarea individual. La próxima la haremos en grupos.',
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        },
      ],
    });
  }

  const courseForum = await prisma.forum.upsert({
    where: { courseId: course.id },
    update: {},
    create: { courseId: course.id },
  });

  // ---- Capa 10: one demo thread with two posts in the course forum ----
  const existingThread = await prisma.forumThread.findFirst({
    where: { forumId: courseForum.id, title: '¿Algún truco para factorizar polinomios rápido?' },
  });
  if (!existingThread) {
    const thread = await prisma.forumThread.create({
      data: {
        forumId: courseForum.id,
        authorId: student1.id,
        title: '¿Algún truco para factorizar polinomios rápido?',
        posts: {
          create: {
            authorId: student1.id,
            body: 'Estoy practicando ejercicios del módulo 2 y me toma mucho tiempo factorizar. ¿Algún método rápido que recomendéis?',
          },
        },
      },
    });
    // The opening post created above. Now add a teacher reply.
    const openingPost = await prisma.forumPost.findFirst({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    });
    if (openingPost) {
      await prisma.forumPost.create({
        data: {
          threadId: thread.id,
          authorId: teacher.id,
          parentId: openingPost.id,
          body: 'Buena pregunta. Mira el método de Ruffini en el material adjunto al módulo 2 — para grado 3 es el más rápido. ¡Mañana lo vemos en la clase en vivo!',
        },
      });
    }
  }

  await prisma.enrollment.upsert({
    where: { courseId_studentId: { courseId: course.id, studentId: student1.id } },
    update: { status: 'ACTIVE', decidedAt: new Date(), decidedById: teacher.id },
    create: {
      courseId: course.id,
      studentId: student1.id,
      status: 'ACTIVE',
      decidedAt: new Date(),
      decidedById: teacher.id,
    },
  });
  await prisma.enrollment.upsert({
    where: { courseId_studentId: { courseId: course.id, studentId: student2.id } },
    update: { status: 'PENDING' },
    create: {
      courseId: course.id,
      studentId: student2.id,
      status: 'PENDING',
    },
  });

  // Curriculum: 2 modules, 4 lessons total, 2 link-type materials (no real S3 needed).
  const mod1 = await prisma.module.upsert({
    where: { courseId_position: { courseId: course.id, position: 1 } },
    update: {},
    create: {
      courseId: course.id,
      title: 'Foundations',
      description: 'Numbers, sets and operations.',
      position: 1,
      publishedAt: new Date(),
    },
  });
  const mod2 = await prisma.module.upsert({
    where: { courseId_position: { courseId: course.id, position: 2 } },
    update: {},
    create: {
      courseId: course.id,
      title: 'Equations',
      description: 'Linear and quadratic equations, factoring.',
      position: 2,
      publishedAt: new Date(),
    },
  });

  const lesson1 = await prisma.lesson.upsert({
    where: { moduleId_position: { moduleId: mod1.id, position: 1 } },
    update: {},
    create: {
      moduleId: mod1.id,
      title: 'Welcome & syllabus',
      content:
        '# Welcome!\n\nWhat we will cover this semester:\n\n- Variables\n- Equations\n- Polynomials\n- Beginner proofs',
      type: LessonType.CONTENT,
      position: 1,
      durationMin: 20,
      publishedAt: new Date(),
    },
  });
  await prisma.lesson.upsert({
    where: { moduleId_position: { moduleId: mod1.id, position: 2 } },
    update: {},
    create: {
      moduleId: mod1.id,
      title: 'Number sets: ℕ, ℤ, ℚ, ℝ',
      content:
        '## Sets of numbers\n\nWe progressively extend natural numbers to integers, rationals, and reals.',
      type: LessonType.CONTENT,
      position: 2,
      durationMin: 35,
      publishedAt: new Date(),
    },
  });
  await prisma.lesson.upsert({
    where: { moduleId_position: { moduleId: mod2.id, position: 1 } },
    update: {},
    create: {
      moduleId: mod2.id,
      title: 'Linear equations',
      content: '## ax + b = 0\n\nIsolating x, multiple solutions, geometric interpretation.',
      type: LessonType.CONTENT,
      position: 1,
      durationMin: 40,
      publishedAt: new Date(),
    },
  });
  await prisma.lesson.upsert({
    where: { moduleId_position: { moduleId: mod2.id, position: 2 } },
    update: {},
    create: {
      moduleId: mod2.id,
      title: 'Quadratic equations (draft)',
      content: '## ax² + bx + c = 0\n\n(Pending — being prepared.)',
      type: LessonType.CONTENT,
      position: 2,
      // No publishedAt → draft; only the teacher sees it.
    },
  });

  // Course-level bibliography (LINK materials — no real S3 needed for the seed).
  const bibCount = await prisma.material.count({
    where: { courseId: course.id, lessonId: null },
  });
  if (bibCount === 0) {
    await prisma.material.createMany({
      data: [
        {
          courseId: course.id,
          title: 'OpenStax — Elementary Algebra (free textbook)',
          type: MaterialType.LINK,
          url: 'https://openstax.org/details/books/elementary-algebra-2e',
        },
        {
          courseId: course.id,
          title: 'Khan Academy — Algebra basics (videos)',
          type: MaterialType.VIDEO_EMBED,
          url: 'https://www.khanacademy.org/math/algebra-basics',
        },
      ],
    });
  }

  // One lesson-level material as a demonstration.
  const lesson1MatCount = await prisma.material.count({ where: { lessonId: lesson1.id } });
  if (lesson1MatCount === 0) {
    await prisma.material.create({
      data: {
        lessonId: lesson1.id,
        title: 'Course syllabus (Wikipedia: Syllabus)',
        type: MaterialType.LINK,
        url: 'https://en.wikipedia.org/wiki/Syllabus',
      },
    });
  }

  // ---- Capa 4 demo: 1 ASSIGNMENT lesson + 1 QUIZ lesson + sample data ----

  const assignmentLesson = await prisma.lesson.upsert({
    where: { moduleId_position: { moduleId: mod2.id, position: 3 } },
    update: {},
    create: {
      moduleId: mod2.id,
      title: 'Tarea: resuelve 5 ecuaciones lineales',
      content: 'Sube un PDF o foto con tus soluciones paso a paso.',
      type: LessonType.ASSIGNMENT,
      position: 3,
      publishedAt: new Date(),
    },
  });
  const existingAsg = await prisma.assignment.findUnique({
    where: { lessonId: assignmentLesson.id },
  });
  const assignment = existingAsg ?? (await prisma.assignment.create({
    data: {
      courseId: course.id,
      lessonId: assignmentLesson.id,
      title: 'Resuelve 5 ecuaciones lineales',
      instructions:
        'Resuelve estas ecuaciones y muestra el procedimiento:\n\n1) 3x + 5 = 14\n2) 2(x-1) = 8\n3) -x/4 + 3 = 5\n4) 5x = 2x + 9\n5) 7 - 2x = -3',
      maxScore: 100,
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // due in 7 days
      allowLate: true,
      latePenaltyPct: 10,
      publishedAt: new Date(),
    },
  }));

  // Student1 already submitted; teacher graded.
  const existingSub = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student1.id } },
  });
  if (!existingSub) {
    const submission = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student1.id,
        status: SubmissionStatus.GRADED,
        notes: 'Adjunto mis soluciones. Tuve dudas con la 4.',
        submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.grade.create({
      data: {
        studentId: student1.id,
        graderId: teacher.id,
        submissionId: submission.id,
        scale: GradeScale.NUMERIC,
        numericValue: 85,
        feedback:
          'Muy bien en general. En la ecuación 4 olvidaste despejar correctamente la x; revisa el paso del traslado de términos.',
      },
    });
  }

  const quizLesson = await prisma.lesson.upsert({
    where: { moduleId_position: { moduleId: mod1.id, position: 3 } },
    update: {},
    create: {
      moduleId: mod1.id,
      title: 'Cuestionario: conjuntos numéricos',
      type: LessonType.QUIZ,
      position: 3,
      publishedAt: new Date(),
    },
  });
  const existingQuiz = await prisma.quiz.findUnique({ where: { lessonId: quizLesson.id } });
  if (!existingQuiz) {
    const quiz = await prisma.quiz.create({
      data: {
        lessonId: quizLesson.id,
        title: 'Cuestionario: conjuntos numéricos',
        description: 'Test rápido sobre ℕ, ℤ, ℚ, ℝ.',
        timeLimitMin: 15,
        maxAttempts: 2,
        publishedAt: new Date(),
      },
    });
    // Question 1: SINGLE_CHOICE
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        prompt: '¿Cuál de los siguientes conjuntos NO incluye al cero?',
        type: QuestionType.SINGLE_CHOICE,
        points: 2,
        options: {
          create: [
            { text: 'ℕ (números naturales, definición moderna)', isCorrect: false, position: 1 },
            { text: 'ℤ (números enteros)', isCorrect: false, position: 2 },
            { text: 'ℕ⁺ (naturales positivos)', isCorrect: true, position: 3 },
            { text: 'ℝ (números reales)', isCorrect: false, position: 4 },
          ],
        },
      },
    });
    // Question 2: MULTIPLE_CHOICE
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 2,
        prompt: '¿Cuáles de estos números son irracionales? (Marca todos los correctos)',
        type: QuestionType.MULTIPLE_CHOICE,
        points: 3,
        options: {
          create: [
            { text: '√2', isCorrect: true, position: 1 },
            { text: '0.75', isCorrect: false, position: 2 },
            { text: 'π', isCorrect: true, position: 3 },
            { text: '22/7', isCorrect: false, position: 4 },
          ],
        },
      },
    });
    // Question 3: TRUE_FALSE
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 3,
        prompt: 'Todo número entero es también un número racional.',
        type: QuestionType.TRUE_FALSE,
        points: 1,
        options: {
          create: [
            { text: 'True', isCorrect: true, position: 1 },
            { text: 'False', isCorrect: false, position: 2 },
          ],
        },
      },
    });
    // Question 4: SHORT_ANSWER
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 4,
        prompt: '¿Cuál es la representación decimal exacta de 1/4?',
        type: QuestionType.SHORT_ANSWER,
        points: 2,
        expectedAnswer: '0.25',
      },
    });
    // Question 5: LONG_ANSWER (manual)
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 5,
        prompt: 'Explica con tus palabras la diferencia entre ℚ y ℝ.',
        type: QuestionType.LONG_ANSWER,
        points: 2,
      },
    });
  }

  // ---- Capa 7: live sessions + 1 fake recording for the demo ----
  // Upcoming session (SCHEDULED): tomorrow at 10:00.
  const tomorrow10 = new Date();
  tomorrow10.setDate(tomorrow10.getDate() + 1);
  tomorrow10.setHours(10, 0, 0, 0);
  const tomorrow11 = new Date(tomorrow10);
  tomorrow11.setHours(11, 0, 0, 0);

  const existingUpcoming = await prisma.liveSession.findFirst({
    where: { courseId: course.id, title: 'Repaso de ecuaciones lineales' },
  });
  if (!existingUpcoming) {
    await prisma.liveSession.create({
      data: {
        courseId: course.id,
        hostId: teacher.id,
        title: 'Repaso de ecuaciones lineales',
        description: 'Resolveremos ejercicios y dudas en directo. Trae el material del módulo 2.',
        roomName: `c${course.id.slice(-6)}-${Math.random().toString(36).slice(2, 14)}`.toLowerCase(),
        status: LiveSessionStatus.SCHEDULED,
        scheduledStart: tomorrow10,
        scheduledEnd: tomorrow11,
        recordOnStart: true,
      },
    });
  }

  // Past session (ENDED) with a fake READY recording — for the demo of the
  // recordings panel. The `StoredFile.key` points at a non-existent S3
  // object; the URL won't actually play unless you upload one, but the UI
  // surfaces the recording entry correctly.
  const existingPast = await prisma.liveSession.findFirst({
    where: { courseId: course.id, title: 'Clase introductoria (grabada)' },
  });
  if (!existingPast) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterday1h = new Date(yesterday.getTime() + 60 * 60 * 1000);
    const pastSession = await prisma.liveSession.create({
      data: {
        courseId: course.id,
        hostId: teacher.id,
        title: 'Clase introductoria (grabada)',
        roomName: `c${course.id.slice(-6)}-${Math.random().toString(36).slice(2, 14)}`.toLowerCase(),
        status: LiveSessionStatus.ENDED,
        scheduledStart: yesterday,
        scheduledEnd: yesterday1h,
        actualStart: yesterday,
        actualEnd: yesterday1h,
      },
    });
    // Fake StoredFile so the recording shows up; key doesn't resolve but the
    // download UI is still exercised.
    const fakeFile = await prisma.storedFile.create({
      data: {
        key: `recordings/${course.id}/${pastSession.id}/demo.mp4`,
        bucket: process.env.S3_BUCKET ?? 'education-lms-dev',
        originalName: 'clase-introductoria.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 0,
        uploaderId: teacher.id,
      },
    });
    await prisma.recording.create({
      data: {
        sessionId: pastSession.id,
        status: RecordingStatus.READY,
        startedAt: yesterday,
        endedAt: yesterday1h,
        durationSec: 60 * 60,
        fileId: fakeFile.id,
      },
    });
  }

  // ---- Capa 8: personal ScheduleEvent for the teacher (visible only to them) ----
  const inThreeDays = new Date();
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  inThreeDays.setHours(15, 0, 0, 0);
  const inThreeDaysEnd = new Date(inThreeDays);
  inThreeDaysEnd.setHours(16, 0, 0, 0);
  const existingPersonal = await prisma.scheduleEvent.findFirst({
    where: { ownerId: teacher.id, title: 'Preparar evaluación del módulo 2' },
  });
  if (!existingPersonal) {
    await prisma.scheduleEvent.create({
      data: {
        ownerId: teacher.id,
        title: 'Preparar evaluación del módulo 2',
        notes: 'Revisar ejercicios, escribir 5 preguntas tipo quiz.',
        startsAt: inThreeDays,
        endsAt: inThreeDaysEnd,
        color: '#8b5cf6',
      },
    });
  }

  // ---- Capa 9: a few demo notifications for student1 so the bell isn't empty ----
  const existingNotif = await prisma.notification.findFirst({
    where: { userId: student1.id },
    select: { id: true },
  });
  if (!existingNotif) {
    await prisma.notification.createMany({
      data: [
        {
          userId: student1.id,
          kind: 'ASSIGNMENT_GRADED',
          title: 'Resuelve 5 ecuaciones lineales',
          body: 'Tu tarea ha sido calificada: 85/100. Mira el feedback del profesor.',
          link: `/courses/algebra-101/lessons/${assignmentLesson.id}`,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
        {
          userId: student1.id,
          kind: 'CHAT_MESSAGE',
          title: 'Algebra 101',
          body: 'Ana Profesora: "No, en esta primera tarea individual. La próxima la haremos en grupos."',
          link: `/messages?room=${courseChatRoom.id}`,
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
        },
        {
          userId: student1.id,
          kind: 'LIVE_SESSION_STARTING',
          title: 'Repaso de ecuaciones lineales',
          body: 'La clase empieza mañana a las 10:00. ¡No te la pierdas!',
          link: `/courses/algebra-101`,
          createdAt: new Date(Date.now() - 30 * 60 * 1000),
        },
      ],
    });
  }

  // Student1 leaves a teacher review.
  const existingReview = await prisma.teacherReview.findUnique({
    where: {
      teacherId_authorId_courseId: {
        teacherId: teacher.id,
        authorId: student1.id,
        courseId: course.id,
      },
    },
  });
  if (!existingReview) {
    await prisma.teacherReview.create({
      data: {
        teacherId: teacher.id,
        authorId: student1.id,
        courseId: course.id,
        rating: 5,
        comment: 'Explica genial, responde rápido y los materiales son muy claros.',
      },
    });
    await prisma.teacherProfile.upsert({
      where: { userId: teacher.id },
      update: { ratingAvg: 5, ratingCount: 1 },
      create: { userId: teacher.id, ratingAvg: 5, ratingCount: 1 },
    });
  }

  console.log('\nSeed complete. Login credentials:');
  console.log(`  Admin:   ${admin.email} / ${env('SEED_ADMIN_PASSWORD', 'ChangeMe123!')}`);
  console.log(`  Teacher: ${teacher.email} / TeacherDemo123!`);
  console.log(`  Pending: ${teacherPending.email} / TeacherDemo123!`);
  console.log(`  Student: ${student1.email} / StudentDemo123!`);
  console.log(`  Parent:  ${parent.email} / ParentDemo123!`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
