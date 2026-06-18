import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import DashboardChrome from '@/components/dashboard/DashboardChrome';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  // Platform admins use the /admin area
  if (session.user.role === 'PLATFORM_ADMIN') {
    redirect('/admin');
  }

  return (
    <DashboardChrome
      user={{
        name: session.user.name,
        role: session.user.role,
        businessName: session.user.businessName,
      }}
    >
      {children}
    </DashboardChrome>
  );
}
