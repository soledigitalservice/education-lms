import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ChatService } from '@/lib/chat/service';
import { MessagesView } from './messages-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { room?: string };
}

export default async function MessagesPage({ searchParams }: PageProps) {
  const user = await requireSession();
  const chat = new ChatService(prisma);
  const rooms = await chat.listMyRooms({ userId: user.id, role: user.role });
  const initialRoomId = searchParams.room ?? rooms[0]?.id ?? null;
  return (
    <MessagesView
      currentUserId={user.id}
      currentUserName={user.fullName}
      rooms={rooms}
      initialRoomId={initialRoomId}
    />
  );
}
