import { useNavigate } from 'react-router';
import SettingsPanel from '../components/SettingsPanel';

export default function SettingsPage() {
  const navigate = useNavigate();

  return (
    <SettingsPanel onClose={() => navigate('/')} />
  );
}
