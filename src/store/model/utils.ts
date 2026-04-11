import type { GLTFLoader } from 'three-stdlib';

export const safeRegisterPlugin = (
	loader: GLTFLoader,
	pluginFactory: (parser: any) => any,
	pluginName: string,
) => {
	try {
		loader.register(pluginFactory);
		return true;
	} catch (error) {
		console.warn(`Failed to register ${pluginName}:`, error);
		return false;
	}
};
