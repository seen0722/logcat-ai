import { useParams, useNavigate } from 'react-router';
import { useAnalysisContext } from '../contexts/AnalysisContext';
import SearchModal from '../components/SearchModal';

export default function SearchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { uploadId } = useAnalysisContext();

  const effectiveId = uploadId ?? id;

  if (!effectiveId) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-gray-500">No analysis loaded.</p>
      </div>
    );
  }

  return (
    <SearchModal
      uploadId={effectiveId}
      onClose={() => navigate(`/analysis/${effectiveId}`)}
    />
  );
}
