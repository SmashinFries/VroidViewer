import { Button, Pressable, Switch, Text, View } from 'react-native';
import { useModelStore } from '../../store/useModelStore';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { VRMMeta } from '@pixiv/three-vrm';
import Modal from 'react-native-modal';
import { ModalButton } from '../modal';
import { useModal } from '../../hooks/useModal';

const SwitchItem = ({
	title,
	value,
	onValChange,
}: {
	title: string;
	value: boolean;
	onValChange: (val: boolean) => void;
}) => {
	return (
		<View
			style={{
				flexDirection: 'row',
				width: '100%',
				alignItems: 'center',
				justifyContent: 'space-between',
			}}
		>
			<Text style={{ fontSize: 18 }}>{title}</Text>
			{/* <View
				style={{ paddingHorizontal: 12, width: '100%', height: 1, backgroundColor: '#000' }}
			/> */}
			<Switch value={value} onValueChange={onValChange} />
		</View>
	);
};

export const SettingsView = () => {
	const { settings, updateModelSettings } = useModelStore();
	const { onModalToggle, visible } = useModal();

	return (
		<ModalButton
			vis={visible}
			onToggle={onModalToggle}
			icon="settings-outline"
			containerStyle={{ minWidth: '35%' }}
		>
			<Text style={{ fontSize: 24, fontWeight: '800' }}>Settings</Text>
			<SwitchItem
				title="Eye Track"
				value={settings.enableEyeLookAt}
				onValChange={(val) => updateModelSettings({ enableEyeLookAt: val })}
			/>
		</ModalButton>
	);
};
