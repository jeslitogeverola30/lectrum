import { useAuth, useUser } from '@clerk/expo';
import { Redirect } from 'expo-router';

import CreateQuiz from '../components/create_quiz.jsx';

export default function CreateQuizRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  return <CreateQuiz creatorId={user?.id} />;
}