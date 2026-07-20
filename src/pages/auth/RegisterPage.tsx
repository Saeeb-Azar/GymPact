import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { registerSchema, type RegisterValues } from '@/lib/validation';
import { AuthLayout } from './AuthLayout';
import { Button, Field, Input } from '@/components/ui/basics';

export function RegisterPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [awaitConfirmation, setAwaitConfirmation] = useState(false);
  const redirect = searchParams.get('redirect') ?? '/';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  if (session) return <Navigate to={redirect} replace />;

  const onSubmit = async (values: RegisterValues) => {
    setServerError(null);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { display_name: values.displayName },
        emailRedirectTo: `${window.location.origin}${redirect}`,
      },
    });
    if (error) {
      setServerError(
        error.message.includes('already registered')
          ? 'Für diese E-Mail-Adresse existiert bereits ein Konto.'
          : error.message,
      );
      return;
    }
    if (!data.session) {
      // E-Mail-Bestätigung ist im Supabase-Projekt aktiviert
      setAwaitConfirmation(true);
      return;
    }
    navigate(redirect, { replace: true });
  };

  if (awaitConfirmation) {
    return (
      <AuthLayout
        title="Fast geschafft!"
        subtitle="Wir haben dir eine E-Mail geschickt. Bitte bestätige deine Adresse, um loszulegen."
      >
        <Link to="/login">
          <Button variant="secondary" className="w-full">
            Zurück zur Anmeldung
          </Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Konto erstellen" subtitle="In einer Minute startklar.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field
          label="Anzeigename"
          htmlFor="displayName"
          error={errors.displayName?.message}
          hint="So sehen dich deine Gruppenmitglieder."
        >
          <Input
            id="displayName"
            autoComplete="name"
            placeholder="z. B. Alex"
            {...register('displayName')}
          />
        </Field>
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
            autoComplete="new-password"
            {...register('password')}
          />
        </Field>
        <Field
          label="Passwort wiederholen"
          htmlFor="passwordConfirm"
          error={errors.passwordConfirm?.message}
        >
          <Input
            id="passwordConfirm"
            type="password"
            autoComplete="new-password"
            {...register('passwordConfirm')}
          />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {serverError}
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Registrieren
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-surface-900/60 dark:text-surface-100/60">
        Schon ein Konto?{' '}
        <Link
          to={`/login${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
          className="font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Anmelden
        </Link>
      </p>
    </AuthLayout>
  );
}
