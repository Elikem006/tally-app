import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Good morning, Elikem 👋</Text>
      <Text style={styles.subtitle}>Here's your spending this month</Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Total Spent</Text>
        <Text style={styles.cardAmount}>GHS 0.00</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#8890A0',
    marginTop: 4,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 14,
    color: '#8890A0',
    marginBottom: 8,
  },
  cardAmount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#00C896',
  },
});