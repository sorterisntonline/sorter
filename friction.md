# Friction Points: Todo App Development

## 1. Authentication Required (401 Unauthorized)
**Issue**: When attempting to create a todo through the frontend, the API returns 401 Unauthorized.

**Root Cause**: The backend entity creation endpoint (`POST /api/entity`) requires authentication, but the frontend is not sending any authentication headers.

**Possible Solutions**:
1. Implement authentication in the frontend (login flow, token storage)
2. Temporarily modify the backend to allow unauthenticated entity creation for the demo
3. Use a test/demo authentication token

**Chosen Solution**: Will check if there are existing authentication patterns in the frontend and implement accordingly.

## Next Steps
- Examine existing authentication patterns in the frontend
- Check if there are test users or demo tokens available
- Implement authentication if needed
