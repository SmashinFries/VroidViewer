import { Text, View, TouchableOpacity } from 'react-native';
import { ANIMS, useModelStore } from '../../store/useModelStore';
import { ModalButton } from '../modal';
import { useModal } from '../../hooks/useModal';

export const AnimationsView = () => {
	const { loadAnimation, animationName } = useModelStore();
	const { onModalToggle, visible } = useModal();

	const onButtonPress = (name: keyof typeof ANIMS) => {
		loadAnimation(name);
		onModalToggle(false);
	};

	const renderAnimationButton = (key: string, idx: number) => {
		const isActive = animationName === key;

		return (
			<TouchableOpacity
				key={idx}
				disabled={isActive}
				onPress={() => onButtonPress(key as keyof typeof ANIMS)}
				style={{
					backgroundColor: isActive ? '#4299e1' : '#e2e8f0',
					borderRadius: 8,
					paddingHorizontal: 16,
					paddingVertical: 10,
					minWidth: 80,
					alignItems: 'center',
					justifyContent: 'center',
					shadowColor: isActive ? '#4299e1' : '#000',
					shadowOffset: { width: 0, height: isActive ? 2 : 1 },
					shadowOpacity: isActive ? 0.3 : 0.1,
					shadowRadius: isActive ? 4 : 2,
					elevation: isActive ? 4 : 2,
					borderWidth: 1,
					borderColor: isActive ? '#3182ce' : 'rgba(0,0,0,0.08)',
					opacity: isActive ? 1 : 0.9,
				}}
				activeOpacity={0.7}
			>
				<Text
					style={{
						color: isActive ? '#ffffff' : '#4a5568',
						fontSize: 14,
						fontWeight: isActive ? '700' : '600',
						textAlign: 'center',
						letterSpacing: 0.3,
					}}
				>
					{key}
				</Text>
			</TouchableOpacity>
		);
	};

	return (
		<ModalButton
			vis={visible}
			onToggle={onModalToggle}
			icon="videocam-outline"
			containerStyle={{
				minWidth: '45%',
				backgroundColor: 'rgba(255,255,255,0.95)',
				borderRadius: 16,
				shadowColor: '#000',
				shadowOffset: { width: 0, height: 4 },
				shadowOpacity: 0.15,
				shadowRadius: 8,
				elevation: 8,
				borderWidth: 1,
				borderColor: 'rgba(0,0,0,0.08)',
				padding: 16,
			}}
		>
			<Text style={{
				fontSize: 24,
				fontWeight: '800',
				color: '#2d3748',
				letterSpacing: 0.5,
				marginBottom: 16,
				textAlign: 'center',
			}}>
				Animations
			</Text>

			<View style={{
				gap: 10,
				flexDirection: 'row',
				flexWrap: 'wrap',
				justifyContent: 'center',
			}}>
				{Object.keys(ANIMS).map(renderAnimationButton)}
			</View>

			{animationName && (
				<View style={{
					backgroundColor: '#f0fff4',
					padding: 10,
					borderRadius: 8,
					borderLeftWidth: 3,
					borderLeftColor: '#48bb78',
					marginTop: 16,
				}}>
					<Text style={{
						fontSize: 12,
						color: '#2f855a',
						fontWeight: '600',
						textAlign: 'center',
					}}>
						✓ Playing: {animationName}
					</Text>
				</View>
			)}
		</ModalButton>
	);
};