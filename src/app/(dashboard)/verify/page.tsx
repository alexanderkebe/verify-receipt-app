import type { Metadata } from 'next';
import VerifyForm from '@/components/verify/VerifyForm';

export const metadata: Metadata = { title: 'Verify Receipt' };

export default function VerifyPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Verify Receipt</h1>
          <p className="page-subtitle">Confirm a customer payment against your registered accounts.</p>
        </div>
      </div>
      <VerifyForm />
    </>
  );
}
