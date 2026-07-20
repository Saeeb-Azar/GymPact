import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { updatePasswordSchema, type UpdatePasswordValues } from '@/lib/validation';
import { AuthLayout } from './AuthLayout';
import { Button, Field, Input } from '@/components/ui/basics';

/**
 * Zielseite des Passwort-zurücksetzen-Links. Supabase meldet den Nutzer
 * über das Link-Token an (detectSessionInUrl), hier wird das neue
 * Passwort gesetzt.
 */
export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordValues>({ resolver: zodResolver(updatePasswordSchema) });

  const onSubmit = async (values: UpdatePasswordValues) => {
    setServerError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setServerError(error.message);
      return;
    }
    navigate('/', { replace: true });
  };

  if (!loading && !session) {
    return (
      <AuthLayout
        title="Link abgelaufen"
        subtitle="Der Link zum Zurücksetzen ist ungültig oder abgelaufen. Fordere einen neuen an."
      >
        <Link to="/forgot-password">
          <Button variant="secondary" className="w-full">
            Neuen Link anfordern
          </Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Neues Passwort" subtitle="Wähle ein sicheres neues Passwort.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Neues Passwort" htmlFor="password" error={errors.password?.message}>
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
          Passwort speichern
        </Button>
      </form>
    </AuthLayout>
  );
}
