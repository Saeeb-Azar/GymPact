import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { loginSchema, type LoginValues } from '@/lib/validation';
import { AuthLayout } from './AuthLayout';
import { Button, Field, Input } from '@/components/ui/basics';

export function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const redirect = searchParams.get('redirect') ?? '/';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  if (session) return <Navigate to={redirect} replace />;

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setServerError(
        error.message === 'Invalid login credentials'
          ? 'E-Mail oder Passwort ist falsch.'
          : error.message,
      );
      return;
    }
    navigate(redirect, { replace: true });
  };

  return (
    <AuthLayout title="Anmelden" subtitle="Willkommen zurück!">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="E-Mail" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="du@example.com"
            {...register('email')}
          />
        </Field>
        <Field label="Passwort" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {serverError}
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Anmelden
        </Button>
      </form>

      <div className="mt-5 space-y-2 text-center text-sm">
        <p>
          <Link
            to="/forgot-password"
            className="font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            Passwort vergessen?
          </Link>
        </p>
        <p className="text-surface-900/60 dark:text-surface-100/60">
          Noch kein Konto?{' '}
          <Link
            to={`/register${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
            className="font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            Registrieren
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
