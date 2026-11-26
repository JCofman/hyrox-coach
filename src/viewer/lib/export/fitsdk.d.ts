declare module "@garmin/fitsdk" {
  export class Encoder {
    onMesg(mesgNum: number, data: Record<string, unknown>): void;
    close(): Uint8Array;
  }

  export class Stream {
    static fromByteArray(data: number[]): Stream;
    static fromBuffer(buffer: Uint8Array): Stream;
    static fromArrayBuffer(buffer: ArrayBuffer): Stream;
  }

  export class Decoder {
    constructor(stream: Stream);
    static isFIT(stream: Stream): boolean;
    read(options?: Record<string, unknown>): {
      messages: Record<string, Record<string, unknown>[]>;
      errors: unknown[];
    };
  }

  export const Profile: {
    MesgNum: {
      FILE_ID: number;
      WORKOUT: number;
      WORKOUT_STEP: number;
    };
  };
}
