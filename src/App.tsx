import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './lib/supabase';
import { Login } from './pages/Login';
import { Library } from './pages/Library';
import { Inbox } from './pages/Inbox';
import { Recipe } from './pages/Recipe';
import { RecipeEdit } from './pages/RecipeEdit';
import { Cook } from './pages/Cook';

export function App() {
  const [sessie, setSessie] = useState<Session | null>(null);
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessie(data.session);
      setGeladen(true);
    });

    const { data: luisteraar } = supabase.auth.onAuthStateChange((_event, nieuwe) => {
      setSessie(nieuwe);
    });
    return () => luisteraar.subscription.unsubscribe();
  }, []);

  if (!geladen) {
    return <p className="laden">Even laden…</p>;
  }

  if (!sessie) {
    return <Login />;
  }

  return (
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/inbox" element={<Inbox />} />
      <Route path="/nieuw" element={<RecipeEdit />} />
      <Route path="/r/:id" element={<Recipe />} />
      <Route path="/r/:id/bewerken" element={<RecipeEdit />} />
      <Route path="/r/:id/koken" element={<Cook />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
