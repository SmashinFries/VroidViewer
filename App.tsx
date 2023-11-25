import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { VRMAvatar } from './src/avatar/vrmAvatar';
import { VRMViewer } from './src/avatar/test';
import  { Test2 } from './src/avatar/test2';

export default function App() {
  return (
    <View style={styles.container}>
      {/* <VRMAvatar /> */}
      {/* <Text>TEST</Text> */}
      {/* <VRMViewer /> */}
      {/* <Matthew /> */}
      <Test2 />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: '100%',
    width: '100%',
  },
});
