// Authentication and cloud storage are separate from ticket generation.
export function createAccountStore(client, onUser) {
  let user = null;
  let generation = 0;
  function accept(next) {
    if (user?.id !== next?.id) generation++;
    user = next;
    onUser(user);
  }
  async function verify() {
    const before = generation;
    const {data, error} = await client.auth.getUser();
    if (before !== generation || error || !data?.user || data.user.id !== user?.id) {
      throw new Error('SESSION_CHANGED');
    }
    return {id: user.id, generation};
  }
  function check(owner) {
    if (generation !== owner.generation || user?.id !== owner.id) throw new Error('SESSION_CHANGED');
  }
  function kind(value) {
    if (!['regular', 'systematic'].includes(value)) throw new Error('INVALID_KIND');
    return value;
  }
  return {
    async init() {
      // Register first so that sign-out while getUser is pending cannot restore an old user.
      client.auth.onAuthStateChange((_event, session) => accept(session?.user || null));
      const before = generation;
      const {data, error} = await client.auth.getUser();
      if (before === generation) accept(error ? null : data?.user || null);
    },
    async signIn(redirectTo) {
      const {error} = await client.auth.signInWithOAuth({provider: 'google', options: {redirectTo}});
      if (error) throw error;
    },
    async signOut() {
      // Immediately reject pending reads/writes from the outgoing account.
      const previous = user;
      accept(null);
      const {error} = await client.auth.signOut({scope: 'local'});
      if (error) {
        // Leave cloud actions locked until a fresh verification succeeds.
        throw error;
      }
      return previous;
    },
    async save(value, payload) {
      kind(value);
      const owner = await verify();
      const {error} = await client.from('loto_saved_forms').upsert({
        user_id: owner.id, kind: value, payload
      }, {onConflict: 'user_id,kind'});
      check(owner);
      if (error) throw error;
    },
    async load(value) {
      kind(value);
      const owner = await verify();
      const {data, error} = await client.from('loto_saved_forms')
        .select('payload,updated_at').eq('user_id', owner.id).eq('kind', value).maybeSingle();
      check(owner);
      if (error) throw error;
      return data;
    }
  };
}
