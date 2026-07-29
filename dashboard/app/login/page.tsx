import { Suspense } from 'react';
import { LoginInner } from './LoginInner';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <LoginInner />
    </Suspense>
  );
}
