import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../services/supabase.js';

export default function CreateQuiz({ session, creatorId }) {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const resolvedCreatorId = creatorId ?? session?.user?.id;

  const handleGenerateQuiz = async () => {
    if (!inputText.trim()) {
      Alert.alert("Error", "Please enter a topic or paste text.");
      return;
    }

    setLoading(true);

    try {
      if (!resolvedCreatorId) {
        throw new Error('Missing creator id for quiz creation.');
      }

      // 1. Call our secure Supabase Edge Function
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('generate-quiz', {
        body: { input_text: inputText }
      });

      if (edgeError || edgeData?.error) {
        let edgeErrorMessage = edgeError?.message;

        if (edgeError?.context && typeof edgeError.context.json === 'function') {
          const payload = await edgeError.context.json().catch(() => null);
          if (payload?.error) {
            edgeErrorMessage = payload.error;
          }
        }

        throw new Error(edgeErrorMessage || edgeData?.error || 'Unknown edge function error');
      }

      const generatedQuizArray = edgeData.quiz;

      // 2. Save the generated JSON to our Supabase Database
      const { error: dbError } = await supabase
        .from('quizzes')
        .insert([
          {
            creator_id: resolvedCreatorId,
            topic: inputText,
            raw_json_content: generatedQuizArray
          }
        ]);

      if (dbError) throw dbError;

      Alert.alert("Success!", "Your quiz has been generated and saved.");
      setInputText(''); // Clear the input

    } catch (error) {
      Alert.alert("Failed to generate quiz", error?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create a Battle</Text>
      <Text style={styles.subtitle}>Enter a topic or paste study guide text:</Text>
      
      <TextInput
        style={styles.input}
        multiline
        placeholder="e.g., Photosynthesis or Capital Cities of Europe"
        value={inputText}
        onChangeText={setInputText}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Groq is generating your quiz...</Text>
        </View>
      ) : (
        <Button title="Generate AI Quiz" onPress={handleGenerateQuiz} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    margin: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 15,
    height: 120,
    textAlignVertical: 'top', // ensures text starts at the top of the box
    marginBottom: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 10,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  }
});