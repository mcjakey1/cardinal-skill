import { useQuery } from '@tanstack/react-query';
import { Link, Stack } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { palette, radius, space, type } from '@/theme/tokens';

interface CourseRow {
  id: string;
  title: string;
  term: string | null;
}

export default function Courses() {
  const { data, isPending, error } = useQuery({
    queryKey: ['courses'],
    queryFn: async (): Promise<CourseRow[]> => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, term')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isPending) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color={palette.cardinal} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centred}>
        <Text style={styles.error}>Couldn&apos;t load your charts. Check your connection and try again.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Charts' }} />
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.list}
        data={data}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No charts yet</Text>
            <Text style={styles.body}>Upload a syllabus and one gets drawn for you.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/tree/[courseId]', params: { courseId: item.id } }} asChild>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.term ? <Text style={styles.eyebrow}>{item.term.toUpperCase()}</Text> : null}
            </View>
          </Link>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.ink },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ink },
  list: { padding: space.md, gap: space.sm },
  card: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.inkRaised,
    borderWidth: 1,
    borderColor: palette.slate,
    gap: space.xs,
  },
  cardTitle: { ...type.title, color: palette.parchment },
  eyebrow: { ...type.eyebrow, color: palette.haze },
  empty: { padding: space.xl, gap: space.sm },
  emptyTitle: { ...type.title, color: palette.parchment },
  body: { ...type.body, color: palette.haze },
  error: { ...type.body, color: palette.danger, textAlign: 'center', padding: space.lg },
});
