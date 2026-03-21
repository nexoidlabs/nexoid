import Constants from 'expo-constants';

const OPENAI_API_KEY =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_OPENAI_API_KEY ??
  process.env.EXPO_PUBLIC_OPENAI_API_KEY ??
  '';

const TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';

export async function transcribeAudio(fileUri: string): Promise<string> {
  const formData = new FormData();

  formData.append('file', {
    uri: fileUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);
  formData.append('model', 'whisper-1');

  const response = await fetch(TRANSCRIPTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.text ?? '';
}
