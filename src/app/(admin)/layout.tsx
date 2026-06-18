import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import AdminChrome from '@/components/admin/AdminChrome';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'PLATFORM_ADMIN') redirect('/dashboard');

  return <AdminChrome user={{ name: session.user.name }}>{children}</AdminChrome>;
}
