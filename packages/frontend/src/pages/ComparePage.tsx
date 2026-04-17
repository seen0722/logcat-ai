import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useComparison } from '../hooks/useComparison';
import ComparisonPage from '../components/ComparisonPage';

export default function ComparePage() {
  const { id1, id2 } = useParams<{ id1: string; id2: string }>();
  const navigate = useNavigate();
  const { comparison, loading, error, compare, reset } = useComparison();

  // Trigger compare on mount if not already loaded
  useEffect(() => {
    if (id1 && id2 && !comparison && !loading) {
      compare(id1, id2);
    }
  }, [id1, id2, comparison, loading, compare]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="glass rounded-xl px-8 py-6 text-center shadow-elevated">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-300">Comparing analyses...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="glass rounded-xl px-8 py-6 text-center max-w-md border-red-900/50 shadow-elevated">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => { reset(); navigate(id1 ? `/analysis/${id1}` : '/'); }}
            className="btn-ghost text-sm"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <ComparisonPage
      comparison={comparison}
      onBack={() => { reset(); navigate(id1 ? `/analysis/${id1}` : '/'); }}
    />
  );
}
