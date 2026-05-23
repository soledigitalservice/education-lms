import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ForumsService } from '@/lib/forums/service';
import { ApiError } from '@/lib/api/errors';
import { Roles } from '@/lib/rbac/roles';
import { getT } from '@/lib/i18n/server';
import { ThreadView } from './thread-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string; threadId: string };
}

export default async function ForumThreadPage({ params }: PageProps) {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };

  const svc = new ForumsService(prisma);
  let data;
  try {
    data = await svc.getThread(params.threadId, ctx);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Determine moderation permission by looking at the underlying course.
  const course = await prisma.forumThread.findUnique({
    where: { id: params.threadId },
    select: { forum: { select: { course: { select: { teacherId: true } } } } },
  });
  const canModerate =
    user.role === Roles.ADMIN || course?.forum.course.teacherId === user.id;

  return (
    <>
      <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <Link
          href={`/courses/${params.slug}/forum`}
          className="text-xs text-slate-500 hover:underline"
        >
          ← {getT()('Foro')}
        </Link>
      </header>
      <ThreadView
        currentUserId={user.id}
        canModerate={canModerate}
        thread={data.thread}
        posts={data.posts}
      />
    </>
  );
}
