import type { ParamListBase } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

/** The paired app's screens: the list is home, a Transcript opens over it. */
export interface StackParams extends ParamListBase {
  Sessions: undefined;
  Transcript: {
    readonly sessionId: string;
    readonly title: string;
    readonly project: string;
  };
}

export type ScreenProps<Name extends keyof StackParams> =
  NativeStackScreenProps<StackParams, Name>;
