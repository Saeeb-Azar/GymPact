// Zielseite des Einladungslinks /join/:code – tritt der Gruppe bei
// und leitet dann auf „Heute“ weiter.

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useJoinGroup } from '@/hooks/queries';
import { Button, Spinner } from '@/components/ui/basics';

export function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const joinGroup = useJoinGroup();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!code || attempted.current) return;
    attempted.current = true;
    joinGroup
      .mutateAsync(code)
      .then((group) => {
        navigate('/', { replace: true, state: { joinedGroup: group.name } });
      })
      .catch(() => {
        setError('Der Einladungslink ist ungültig oder abgelaufen.');
      });
  }, [code, joinGroup, navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-bold">Beitritt nicht möglich</h1>
          <p className="text-sm text-surface-900/60 dark:text-surface-100/60">{error}</p>
          <Link to="/group">
            <Button variant="secondary">Zur Gruppenübersicht</Button>
          </Link>
        </>
      ) : (
        <>
          <Spinner className="h-8 w-8 text-brand-600" />
          <p className="text-sm text-surface-900/60 dark:text-surface-100/60">
            Du trittst der Gruppe bei…
          </p>
        </>
      )}
    </div>
  );
}
