import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to stories dashboard on app load
    // Use replace to prevent going back to this welcome page
    router.replace('/stories');
  }, []);

  // Return null while redirecting (prevents flash of welcome screen)
  return null;
}
