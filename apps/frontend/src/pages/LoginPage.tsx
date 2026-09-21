import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router-dom';
import { ArrowRight, Layers3, ShieldCheck } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { ErrorMessage } from '../components/Feedback';
export function LoginPage() {
  const { user, login } = useAuth();
  const [error, setError] = useState<unknown>();
  const { register, handleSubmit, formState } = useForm<{ username: string; password: string }>();
  if (user) return <Navigate to="/registries" replace />;
  return (
    <div className="login">
      <div className="login-story">
        <div className="brand">
          <Layers3 /> DATA TRANSFORMERS<span>REGISTRY</span>
        </div>
        <div>
          <span className="eyebrow">LA CONNAISSANCE COMMENCE ICI</span>
          <h1>
            Vos documents.
            <br />
            Des règles claires.
            <br />
            <em>Un savoir structuré.</em>
          </h1>
          <p>
            Un référentiel commun pour décrire, reconnaître et préparer chaque famille documentaire.
          </p>
        </div>
        <div className="login-footer">Contrats versionnés · YAML ouvert · Données maîtrisées</div>
      </div>
      <div className="login-panel">
        <form
          onSubmit={handleSubmit(async (values) => {
            try {
              setError(undefined);
              await login(values.username, values.password);
            } catch (e) {
              setError(e);
            }
          })}
        >
          <div className="login-icon">
            <ShieldCheck />
          </div>
          <span className="eyebrow">ESPACE ADMINISTRATEUR</span>
          <h2>Bienvenue.</h2>
          <p className="muted">Connectez-vous à votre référentiel documentaire.</p>
          <label className="form-field">
            Utilisateur
            <input
              autoComplete="username"
              autoFocus
              {...register('username', { required: true })}
            />
          </label>
          <label className="form-field">
            Mot de passe
            <input
              type="password"
              autoComplete="current-password"
              {...register('password', { required: true })}
            />
          </label>
          <ErrorMessage error={error} />
          <button className="button primary login-submit" disabled={formState.isSubmitting}>
            Se connecter <ArrowRight size={18} />
          </button>
          <small className="muted">Accès réservé aux utilisateurs autorisés.</small>
        </form>
      </div>
    </div>
  );
}
