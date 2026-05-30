import { redirect } from 'next/navigation';

/**
 * Public account creation is disabled — only administrators create users.
 * Anyone landing on /register is sent to the login page.
 */
export default function RegisterPage(): never {
  redirect('/login');
}
