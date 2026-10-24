// Lectura perezosa de variables de entorno (solo servidor). Nunca importar desde componentes cliente.
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Complétala en .env.local (ver .env.example).`,
    );
  }
  return value;
}

export const env = {
  get apiKey() {
    return required("BUNGIE_API_KEY");
  },
  get clientId() {
    return required("BUNGIE_CLIENT_ID");
  },
  get clientSecret() {
    return required("BUNGIE_CLIENT_SECRET");
  },
  get redirectUri() {
    return required("BUNGIE_REDIRECT_URI");
  },
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) {
      throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
    }
    return secret;
  },
};
