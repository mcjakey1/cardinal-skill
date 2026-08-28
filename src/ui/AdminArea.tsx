import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ADMIN_POWERS, adminUnlocked, lockAdmin, unlockAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { lms } from '@/theme/lms';
import { Badge, Field, LButton, LText, Notice, Panel, PanelHead, Skeleton } from '@/ui/lms';

/**
 * The admin area of the instructor workspace.
 *
 * The password in `src/lib/admin.ts` decides what this file SHOWS. It decides
 * nothing else, and the comment over that constant says why at length. The
 * server answer below is the one that will matter: the same `administrators`
 * table every admin RPC re-checks in its own body.
 *
 * Everything here draws in the LMS tokens, like the rest of `/instructor`.
 */

/**
 * Mirrors `fetchInstructorVerification` in
 * `src/features/skilltree/courseCatalog.ts`, including its fail-closed branch:
 * migration 0028 has not been applied to the live project, so this table is a
 * 404 today. A missing table means "not an administrator" — which is the safe
 * answer — not a broken screen.
 */
async function fetchIsAdministrator(): Promise<boolean> {
  const { data, error } = await supabase.from('administrators').select('user_id').maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return false;
    throw error;
  }
  return Boolean(data);
}

export function AdminArea({ liveSession }: { liveSession: boolean }) {
  const [unlocked, setUnlocked] = useState(adminUnlocked);
  const [entry, setEntry] = useState('');
  const [wrong, setWrong] = useState(false);

  const submit = () => {
    if (unlockAdmin(entry)) {
      setUnlocked(true);
      setEntry('');
      setWrong(false);
      return;
    }
    setWrong(true);
  };

  return (
    <>
      <View style={styles.head}>
        <LText variant="page">Admin</LText>
        <LText variant="body" tone="muted" style={styles.prose}>
          {unlocked
            ? 'What an administrator can do, and whether this account is one.'
            : 'This area is for whoever looks after the whole site. It stays closed until the administrator password is typed in.'}
        </LText>
      </View>

      {unlocked ? (
        <Unlocked liveSession={liveSession} onLock={() => { lockAdmin(); setUnlocked(false); }} />
      ) : (
        <Panel>
          <PanelHead title="Administrator password" />
          <View style={styles.body}>
            <Field
              label="Password"
              value={entry}
              onChangeText={(next) => {
                setEntry(next);
                setWrong(false);
              }}
              onSubmitEditing={submit}
              returnKeyType="go"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Type the password"
              style={styles.input}
              error={wrong ? 'That password is not right. Check it and type it again.' : undefined}
              hint="If you do not have it, ask whoever set this site up. Nothing is hidden from you until then — this area is simply not yours."
            />
            <LButton
              label="Open the admin area"
              icon="unlock"
              variant="primary"
              onPress={submit}
              style={styles.tall}
            />
          </View>
        </Panel>
      )}
    </>
  );
}

function Unlocked({ liveSession, onLock }: { liveSession: boolean; onLock: () => void }) {
  const admin = useQuery({
    queryKey: ['is-administrator'],
    queryFn: fetchIsAdministrator,
    enabled: liveSession,
    // One try. A retried failure means half a minute of spinner in front of an
    // answer that would be "no" either way.
    retry: false,
  });
  const isAdmin = admin.data === true;

  return (
    <>
      <Panel>
        <PanelHead title="Is this account an administrator?" />
        <View style={styles.body}>
          {admin.isLoading ? (
            <Skeleton width="60%" />
          ) : (
            <Badge
              tone={isAdmin ? 'ok' : 'neutral'}
              icon={isAdmin ? 'check' : 'minus'}
              label={isAdmin ? 'Yes, on the server' : 'No, not on the server'}
            />
          )}

          <LText variant="small" style={styles.prose}>
            {isAdmin
              ? 'This account is listed in the site’s administrator record, so the actions below will work for you once they are built.'
              : 'The password opened this page, and that is all it did. Being an administrator is a record the server keeps, and this account is not in it, so none of the actions below would be allowed even if they were built.'}
          </LText>

          {!liveSession ? (
            <LText variant="small" tone="muted" style={styles.prose}>
              This is a local demo session, so there is no server to ask. Sign out and sign in with
              a real account to see the real answer.
            </LText>
          ) : admin.isError ? (
            <LText variant="small" tone="muted" style={styles.prose}>
              The server could not be reached just now, so this account is treated as not an
              administrator. Check your internet connection and open this page again.
            </LText>
          ) : null}
        </View>
      </Panel>

      <Panel>
        <PanelHead title="What an administrator can do" />
        <View style={styles.body}>
          <Notice tone="attention" title="None of this is built yet">
            This page lists what is coming, so nobody has to guess. There are no buttons here to
            press, and typing the password did not grant anything.
          </Notice>
          {ADMIN_POWERS.map((power) => (
            <View key={power} style={styles.item}>
              <LText variant="small" tone="muted">
                {'•'}
              </LText>
              <LText variant="small" style={styles.prose}>
                {power}
              </LText>
            </View>
          ))}
        </View>
      </Panel>

      <Panel>
        <PanelHead title="Close this area" />
        <View style={styles.body}>
          <LText variant="small" style={styles.prose}>
            Closing hides this page again until the password is typed in. It happens on its own
            whenever the app is reloaded, so nothing is left open on a shared computer.
          </LText>
          <View style={styles.row}>
            <LButton label="Close the admin area" icon="lock" onPress={onLock} style={styles.tall} />
          </View>
        </View>
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  head: { gap: lms.space.xs },
  body: { padding: lms.space.lg, gap: lms.space.md },
  prose: { maxWidth: 620 },
  item: { flexDirection: 'row', gap: lms.space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: lms.space.sm },
  // Bigger than the workspace default on purpose: this is the round of work that
  // holds every target to the 44px floor `lms.touch` names.
  input: { minHeight: lms.touch, fontSize: 16 },
  tall: { minHeight: lms.touch, paddingHorizontal: lms.space.lg },
});
