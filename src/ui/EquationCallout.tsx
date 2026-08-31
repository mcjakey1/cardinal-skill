import { StyleSheet, Text, View } from 'react-native';

import { equationText } from '@/theme/mathTypography';
import { bevel, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export function EquationCallout({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="text"
      style={[
        styles.card,
        { backgroundColor: t.ground, borderColor: t.line, borderLeftColor: t.warning },
      ]}
    >
      <Text style={[equationText, { color: t.ink }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: bevel + 1,
    borderRadius: bevel,
    paddingHorizontal: space.md - space.hair,
    paddingVertical: space.cell + space.hair,
    marginVertical: space.cell + space.hair,
  },
});
