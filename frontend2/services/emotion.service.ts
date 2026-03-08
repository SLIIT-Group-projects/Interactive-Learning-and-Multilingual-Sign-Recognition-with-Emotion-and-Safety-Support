import apiService from "../services/api.service";

export async function predictEmotion(imageUri: string) {
  const form = new FormData();

  form.append("file", {
    uri: imageUri,
    name: "photo.jpg",
    type: "image/jpeg",
  } as any);

  const res = await fetch(`${apiService}/api/emotion/predict`, {
    method: "POST",
    body: form,
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}
