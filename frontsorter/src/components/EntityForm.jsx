import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createEntity } from '../fetchers/entityEndpoints';

// Zod schema matching backend EntityPayload
const entitySchema = z.object({
  pk_namespace: z.string().min(1, 'Namespace is required'),
  pk: z.string().min(1, 'Primary key is required'),
  title: z.string().optional(),
  profile_picture_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  metadata: z.string().optional().transform((val) => {
    if (!val || val.trim() === '') return null;
    try {
      return JSON.parse(val);
    } catch {
      throw new Error('Invalid JSON format');
    }
  })
});

function EntityForm({ onSuccess, onCancel }) {
  const queryClient = useQueryClient();
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError
  } = useForm({
    resolver: zodResolver(entitySchema),
    defaultValues: {
      pk_namespace: '',
      pk: '',
      title: '',
      profile_picture_url: '',
      metadata: ''
    }
  });

  const createMutation = useMutation({
    mutationFn: createEntity,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      reset();
      onSuccess?.(data);
    },
    onError: (error) => {
      console.error('Failed to create entity:', error);
      setError('root', { 
        type: 'manual', 
        message: error.message || 'Failed to create entity' 
      });
    }
  });

  const onSubmit = (data) => {
    createMutation.mutate(data);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-lg mx-auto">
      <h2 className="text-xl font-semibold mb-6">Create New Entity</h2>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Namespace */}
        <div>
          <label htmlFor="pk_namespace" className="block text-sm font-medium text-gray-700 mb-1">
            Namespace *
          </label>
          <input
            {...register('pk_namespace')}
            type="text"
            id="pk_namespace"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., spotify.track, custom.person"
          />
          {errors.pk_namespace && (
            <p className="text-red-600 text-sm mt-1">{errors.pk_namespace.message}</p>
          )}
        </div>

        {/* Primary Key */}
        <div>
          <label htmlFor="pk" className="block text-sm font-medium text-gray-700 mb-1">
            Primary Key *
          </label>
          <input
            {...register('pk')}
            type="text"
            id="pk"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Unique identifier"
          />
          {errors.pk && (
            <p className="text-red-600 text-sm mt-1">{errors.pk.message}</p>
          )}
        </div>

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            {...register('title')}
            type="text"
            id="title"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Display name"
          />
          {errors.title && (
            <p className="text-red-600 text-sm mt-1">{errors.title.message}</p>
          )}
        </div>

        {/* Profile Picture URL */}
        <div>
          <label htmlFor="profile_picture_url" className="block text-sm font-medium text-gray-700 mb-1">
            Profile Picture URL
          </label>
          <input
            {...register('profile_picture_url')}
            type="url"
            id="profile_picture_url"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="https://example.com/image.jpg"
          />
          {errors.profile_picture_url && (
            <p className="text-red-600 text-sm mt-1">{errors.profile_picture_url.message}</p>
          )}
        </div>

        {/* Metadata */}
        <div>
          <label htmlFor="metadata" className="block text-sm font-medium text-gray-700 mb-1">
            Metadata (JSON)
          </label>
          <textarea
            {...register('metadata')}
            id="metadata"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            placeholder='{"key": "value"}'
          />
          {errors.metadata && (
            <p className="text-red-600 text-sm mt-1">{errors.metadata.message}</p>
          )}
        </div>

        {/* Error Display */}
        {errors.root && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-red-600 text-sm">{errors.root.message}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex space-x-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting || createMutation.isPending}
            className={`flex-1 py-2 px-4 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              isSubmitting || createMutation.isPending
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isSubmitting || createMutation.isPending ? 'Creating...' : 'Create Entity'}
          </button>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default EntityForm;
