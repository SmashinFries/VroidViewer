import { Button, Image, Text, View } from 'react-native';
// import { useProgress } from '@react-three/drei';
import { useModelStore } from '../store/useModelStore';

export const ModelSelector = () => {
	const { modelName, thumbnail, isLoading, loadProgress, changeModel } = useModelStore();
	// const { progress } = useProgress();
	return (
		<View
			style={{
				position: 'absolute',
				bottom: 12,
				left: 12,
				backgroundColor: 'rgba(255,255,255,0.8)',
				borderRadius: 12,
				padding: 12,
				gap: 6,
			}}
		>
			<Text onPress={() => console.log('TEST')} style={{ fontSize: 16, fontWeight: '900' }}>
				Model Select
			</Text>
			{thumbnail && (
				<Image
					source={{ uri: thumbnail }}
					style={{ width: 80, aspectRatio: 1 }}
					resizeMode="contain"
				/>
			)}
			<Button
				title="VRM 0"
				onPress={() => {
					console.log('Pressed model vrm0');
					changeModel('vrm0');
				}}
				disabled={modelName === 'vrm0'}
			/>
			<Button
				title="VRM 1"
				onPress={() => changeModel('vrm1')}
				disabled={modelName === 'vrm1'}
			/>
			<Text>{isLoading ? `Progress: ${loadProgress}%` : 'Model loaded!'}</Text>
		</View>
	);
};
