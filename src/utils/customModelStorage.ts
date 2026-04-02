import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

export type CustomModelInfo = {
	uri: string;
	name: string;
	size?: number | null;
	thumbnailUri?: string | null;
	importedAt: number;
};

const CUSTOM_MODEL_KEY = 'custom_model_info';
const CUSTOM_MODEL_DIR = `${FileSystem.documentDirectory ?? ''}models/`;
const CUSTOM_MODEL_FILE = 'custom.vrm';
const CUSTOM_MODEL_THUMB_PREFIX = 'custom_thumbnail';

const ensureCustomModelDir = async (): Promise<void> => {
	if (!FileSystem.documentDirectory) {
		throw new Error('Persistent storage is unavailable on this platform.');
	}
	const dirInfo = await FileSystem.getInfoAsync(CUSTOM_MODEL_DIR);
	if (!dirInfo.exists) {
		await FileSystem.makeDirectoryAsync(CUSTOM_MODEL_DIR, { intermediates: true });
	}
};

export const loadCustomModelInfo = async (): Promise<CustomModelInfo | null> => {
	try {
		const raw = await AsyncStorage.getItem(CUSTOM_MODEL_KEY);
		if (!raw) return null;
		const info = JSON.parse(raw) as CustomModelInfo;
		if (!info?.uri) return null;
		const fileInfo = await FileSystem.getInfoAsync(info.uri);
		if (!fileInfo.exists) {
			await AsyncStorage.removeItem(CUSTOM_MODEL_KEY);
			return null;
		}
		if (info.thumbnailUri) {
			const thumbInfo = await FileSystem.getInfoAsync(info.thumbnailUri);
			if (!thumbInfo.exists) {
				info.thumbnailUri = null;
			}
		}
		return info;
	} catch (error) {
		console.warn('Failed to load custom model info:', error);
		return null;
	}
};

export const saveCustomModelFromUri = async (
	sourceUri: string,
	displayName: string,
	size?: number | null,
	thumbnailUri?: string | null,
): Promise<CustomModelInfo> => {
	if (!sourceUri) {
		throw new Error('No source URI provided for custom model.');
	}

	await ensureCustomModelDir();

	const destinationUri = `${CUSTOM_MODEL_DIR}${CUSTOM_MODEL_FILE}`;
	const existing = await FileSystem.getInfoAsync(destinationUri);
	if (existing.exists) {
		await FileSystem.deleteAsync(destinationUri, { idempotent: true });
	}

	await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });

	let savedThumbnailUri: string | null = null;
	if (thumbnailUri) {
		const sanitizedUri = thumbnailUri.split('?')[0];
		const ext = sanitizedUri.includes('.')
			? sanitizedUri.split('.').pop()?.toLowerCase()
			: 'jpg';
		const thumbFile = `${CUSTOM_MODEL_THUMB_PREFIX}.${ext || 'jpg'}`;
		const thumbDestination = `${CUSTOM_MODEL_DIR}${thumbFile}`;
		const existingThumb = await FileSystem.getInfoAsync(thumbDestination);
		if (existingThumb.exists) {
			await FileSystem.deleteAsync(thumbDestination, { idempotent: true });
		}
		await FileSystem.copyAsync({ from: thumbnailUri, to: thumbDestination });
		savedThumbnailUri = thumbDestination;
	}

	const info: CustomModelInfo = {
		uri: destinationUri,
		name: displayName || 'Custom VRM',
		size: size ?? null,
		thumbnailUri: savedThumbnailUri,
		importedAt: Date.now(),
	};

	await AsyncStorage.setItem(CUSTOM_MODEL_KEY, JSON.stringify(info));
	return info;
};

export const deleteCustomModelInfo = async (): Promise<void> => {
	try {
		const info = await loadCustomModelInfo();
		if (info?.uri) {
			await FileSystem.deleteAsync(info.uri, { idempotent: true });
		}
		if (info?.thumbnailUri) {
			await FileSystem.deleteAsync(info.thumbnailUri, { idempotent: true });
		}
	} catch (error) {
		console.warn('Failed to delete custom model file:', error);
	} finally {
		await AsyncStorage.removeItem(CUSTOM_MODEL_KEY);
	}
};
