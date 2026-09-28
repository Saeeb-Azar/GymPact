// Passwort-Manager-Unterstützung.
// Safari/iOS (Schlüsselbund) erkennt das Formular über die autocomplete-Attribute
// und bietet nach dem Absenden das Speichern an. Chrome/Android nutzt zusätzlich
// die Credential-Management-API, die wir nach erfolgreichem Login explizit auslösen.

interface PasswordCredentialCtor {
  new (data: { id: string; password: string; name?: string }): Credential;
}

export async function storeCredential(email: string, password: string, name?: string) {
  try {
    const Ctor = (window as unknown as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential;
    if (!Ctor || !navigator.credentials?.store) return;
    await navigator.credentials.store(new Ctor({ id: email, password, name }));
  } catch {
    // Nutzer hat abgelehnt oder Browser unterstützt es nicht – kein Problem.
  }
}
