import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import {
	deleteCustomModelInfo,
	loadCustomModelInfo,
	saveCustomModelFromUri,
} from '../../../utils/customModelStorage';
import type { ModelAction, ModelSlice } from '../types';

export const customModelSlice: ModelSlice<
	Pick<ModelAction, 'loadCustomModelFromStorage' | 'importCustomModel' | 'deleteCustomModel'>
> = (set, get) => ({
	loadCustomModelFromStorage: async () => {
		if (Platform.OS === 'web') return;
		try {
			const info = await loadCustomModelInfo();
			set({ customModel: info });
		} catch (error) {
			console.warn('Failed to load custom model info:', error);
			set({ customModel: null });
		}
	},

	importCustomModel: async (options) => {
		if (Platform.OS === 'web') {
			console.warn('Custom model import is only supported on mobile.');
			return false;
		}
		if (get().isPickingModel) {
			console.warn('Document picker already in progress.');
			return false;
		}

		try {
			set({ isPickingModel: true, importModelError: null });

			let sourceUri = options?.sourceUri ?? '';
			let displayName = options?.displayName ?? '';
			let fileSize = options?.size ?? null;
			let fileNameFromPicker = '';
			let mimeTypeFromPicker = '';

			if (!sourceUri) {
				const result = await DocumentPicker.getDocumentAsync({
					type: '*/*',
					copyToCacheDirectory: true,
					multiple: false,
				});

				if (result.canceled || !result.assets?.length) {
					return false;
				}

				const asset = result.assets[0];
				if (!asset?.uri) {
					console.warn('No asset URI returned from document picker.');
					set({ importModelError: 'No file URI returned by the picker.' });
					return false;
				}

				sourceUri = asset.uri;
				fileNameFromPicker = asset.name ?? '';
				fileSize = asset.size ?? null;
				mimeTypeFromPicker = asset.mimeType ?? '';
			}

			const derivedName =
				displayName || fileNameFromPicker || sourceUri.split('/').pop() || 'Custom VRM';
			const fileName = derivedName.replace(/\.vrm$/i, '');

			const lowerName = derivedName.toLowerCase();
			const uriPath = sourceUri.split('?')[0];
			const uriExt = uriPath.includes('.') ? uriPath.split('.').pop()?.toLowerCase() : '';
			const mimeType = (mimeTypeFromPicker || '').toLowerCase();
			const isVrm =
				lowerName.endsWith('.vrm') ||
				uriExt === 'vrm' ||
				mimeType.includes('model') ||
				mimeType.includes('octet-stream');

			if (!isVrm) {
				console.warn('Selected file does not look like a VRM file.');
				set({
					importModelError:
						'Selected file does not look like a .vrm. Please choose a VRM file.',
				});
				return false;
			}

			const info = await saveCustomModelFromUri(
				sourceUri,
				fileName,
				fileSize,
				options?.thumbnailUri ?? null,
			);
			set({
				customModel: info,
				modelName: 'custom',
				modelUri: info.uri,
				thumbnail: null,
				importModelError: null,
			});

			await get().loadModel(info.uri);
			return true;
		} catch (error) {
			console.error('Failed to import custom model:', error);
			set({ importModelError: 'Import failed. Please try another .vrm file.' });
			return false;
		} finally {
			set({ isPickingModel: false });
		}
	},

	deleteCustomModel: async () => {
		try {
			await deleteCustomModelInfo();
		} catch (error) {
			console.warn('Failed to delete custom model:', error);
		} finally {
			set({ customModel: null });
			if (get().modelName === 'custom') {
				get().changeModel('vrm1');
			}
		}
	},
});
