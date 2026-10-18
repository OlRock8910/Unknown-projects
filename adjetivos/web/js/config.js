// Where signed-in progress is kept: a Supabase project (supabase.com).
// Both values come from the project's Settings › API page. The anon key is
// meant to be public — what each person can read or change is enforced by
// the database's row-level security (see docs/SIGN-IN.md).
//
// While these are empty, sign-in is hidden and the app works as before.
const CLOUD = window.CLOUD_OVERRIDE || {
  url: '',
  anonKey: '',
};
