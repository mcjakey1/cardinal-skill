/**
 * How a `KeyboardAvoidingView` should behave, in one place.
 *
 * iOS does not resize the root view for its keyboard, so a form's controls end
 * up underneath it; padding keeps them reachable. Android and web do resize,
 * and adding padding on top of that pushes the controls off the other edge —
 * so the platforms genuinely differ, and this is the reason.
 */
import { Platform } from 'react-native';

export const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? ('padding' as const) : undefined;
