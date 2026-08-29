import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { CURRENT_POLICY_VERSION } from './policies.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = 加载中, null = 未登录
  const [profile, setProfile] = useState(null);
  const [hasAgreedTerms, setHasAgreedTerms] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data));
  }, [session]);

  const refreshAgreement = useCallback(async () => {
    if (!session) { setHasAgreedTerms(false); setAgreementChecked(true); return; }
    setAgreementChecked(false);
    const { data } = await supabase
      .from('policy_agreements')
      .select('policy_version')
      .eq('user_id', session.user.id)
      .eq('policy_version', CURRENT_POLICY_VERSION)
      .maybeSingle();
    setHasAgreedTerms(!!data);
    setAgreementChecked(true);
  }, [session]);

  useEffect(() => { refreshAgreement(); }, [refreshAgreement]);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading: session === undefined,
    isAdmin: !!profile?.is_admin || !!profile?.is_owner,
    isOwner: !!profile?.is_owner,
    hasAgreedTerms,
    agreementChecked,
    refreshAgreement,
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
