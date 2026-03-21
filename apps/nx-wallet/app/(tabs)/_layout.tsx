import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
import { DynamicColorIOS, Platform } from 'react-native';

export default function TabLayout() {
  return (
    <NativeTabs
      labelStyle={{
        color: DynamicColorIOS({
          dark: 'white',
          light: 'black',
        }),
      }}
      tintColor={DynamicColorIOS({
        dark: 'white',
        light: 'black',
      })}
    >
      <NativeTabs.Trigger name="index">
        <Label>Payments</Label>
        {Platform.select({
          ios: <Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} />,
          android: <Icon src={<VectorIcon family={FontAwesome} name="money" />} />,
        })}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="identities">
        <Label>Identities</Label>
        {Platform.select({
          ios: <Icon sf={{ default: 'person.text.rectangle', selected: 'person.text.rectangle.fill' }} />,
          android: <Icon src={<VectorIcon family={FontAwesome} name="id-card" />} />,
        })}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tasks">
        <Label>Chats</Label>
        {Platform.select({
          ios: <Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} />,
          android: <Icon src={<VectorIcon family={FontAwesome} name="comments" />} />,
        })}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Label>Settings</Label>
        {Platform.select({
          ios: <Icon sf={{ default: 'gear', selected: 'gear' }} />,
          android: <Icon src={<VectorIcon family={FontAwesome} name="gear" />} />,
        })}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
