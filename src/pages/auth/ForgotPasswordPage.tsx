import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/validation';
import { AuthLayout } from './AuthLayout';
import { friendlyNetworkMessage } from '@/lib/netError';
import { Button, Field, Input } from '@/components/ui/basics';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [params] = useSearchParams();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: params.get('email') ?? '' },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setServerError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setServerError(friendlyNetworkMessage(error.message));
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthLayout
        title="E-Mail unterwegs"
        subtitle="Falls ein Konto existiert, haben wir dir einen Link zum Zurücksetzen geschickt. Schau auch im Spam-Ordner nach."
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
    <AuthLayout
      title="Passwort zurücksetzen"
      subtitle="Wir schicken dir einen Link an deine E-Mail-Adresse."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="E-Mail" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            placeholder="du@example.com"
            {...register('email')}
          />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {serverError}
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Link senden
        </Button>
      </form>

      <p className="mt-5 text-center text-sm">
        <Link
          to="/login"
          className="font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Zurück zur Anmeldung
        </Link>
      </p>
    </AuthLayout>
  );
}
