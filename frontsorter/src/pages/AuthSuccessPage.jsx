import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthSuccessPage() {
  const { refetchSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    refetchSession();
    navigate('/', { replace: true });
  }, [navigate, refetchSession]);

  return null;
}
