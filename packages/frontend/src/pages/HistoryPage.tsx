import { useNavigate } from 'react-router';
import HistoryPanel from '../components/HistoryPanel';

export default function HistoryPage() {
  const navigate = useNavigate();

  return (
    <HistoryPanel
      onLoad={(id) => navigate(`/analysis/${id}`)}
      onClose={() => navigate('/')}
    />
  );
}
