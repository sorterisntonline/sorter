import { useNavigate } from 'react-router-dom';
import EntityForm from '../components/EntityForm';

function CreateEntityPage() {
  const navigate = useNavigate();

  const handleSuccess = (data) => {
    console.log('Entity created successfully:', data);
    // Navigate to the new entity's detail page
    navigate(`/entity/${encodeURIComponent(data.pk_namespace)}/${encodeURIComponent(data.pk)}`);
  };

  const handleCancel = () => {
    navigate(-1); // Go back to previous page
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <EntityForm onSuccess={handleSuccess} onCancel={handleCancel} />
      </div>
    </div>
  );
}

export default CreateEntityPage;
