import React, { useRef, useState } from 'react';
import { Platform, View, TouchableOpacity, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MetaView } from './meta';
import { SettingsView } from './settings';
import { AnimationsView } from './animation';
import { MixamoAnimationView } from './mixamo';

interface MenusContainerProps {
	onPreviewPress: () => void;
}

export const MenusContainer: React.FC<MenusContainerProps> = ({ onPreviewPress }) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isSidebarOpen, setSidebarOpen] = useState(false);
	const animation = useRef(new Animated.Value(0)).current;

	const toggleMenu = () => {
		const toValue = isOpen ? 0 : 1;
		Animated.timing(animation, {
			toValue,
			duration: 300,
			easing: Easing.bezier(0.25, 0.1, 0.25, 1),
			useNativeDriver: true,
		}).start();
		setIsOpen(!isOpen);
	};

	const rotation = animation.interpolate({
		inputRange: [0, 1],
		outputRange: ['0deg', '90deg'],
	});

	const translateY = animation.interpolate({
		inputRange: [0, 1],
		outputRange: [-20, 0],
	});

	const opacity = animation.interpolate({
		inputRange: [0, 0.5, 1],
		outputRange: [0, 0, 1],
	});

	return (
		<>
			<View style={styles.container}>
				<TouchableOpacity onPress={toggleMenu} style={styles.fab} activeOpacity={0.7}>
					<Animated.View style={{ transform: [{ rotate: rotation }] }}>
						<Ionicons name={isOpen ? 'close' : 'grid'} size={24} color="#FFF" />
					</Animated.View>
				</TouchableOpacity>

				<Animated.View
					style={[
						styles.menuItems,
						{
							opacity,
							transform: [{ translateY }],
						},
					]}
					pointerEvents={isOpen ? 'auto' : 'none'}
				>
					<MetaView />
					<MixamoAnimationView />
					<AnimationsView />
					<SettingsView />
				</Animated.View>
			</View>
		</>
	);
};

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		top: Platform.OS === 'web' ? 10 : 55,
		right: 10,
		alignItems: 'center',
		zIndex: 50,
	},
	fab: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: 'rgba(255,255,255,0.2)',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 8,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		borderWidth: 1,
		borderColor: 'rgba(0,0,0,0.08)',
	},
	menuItems: {
		alignItems: 'center',
		gap: 8,
	},
	iconContainer: {
		backgroundColor: 'rgba(255,255,255,0.8)',
		borderRadius: 16,
		justifyContent: 'center',
		alignItems: 'center',
		width: 44,
		height: 44,
	},
	historyBtn: {
		width: 44,
		height: 44,
		borderRadius: 16,
		...(Platform.OS === 'ios'
			? {
				shadowColor: '#000',
				shadowOffset: { width: 0, height: 2 },
				shadowOpacity: 0.25,
				shadowRadius: 3.84,
			}
			: {
				elevation: 8,
			}
		),
	},
});