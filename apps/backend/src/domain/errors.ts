export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export const conflict = () =>
  new AppError(
    409,
    'CONFLICT',
    'Ce fichier a été modifié depuis son ouverture. Rechargez la dernière version avant d’enregistrer.',
  );
