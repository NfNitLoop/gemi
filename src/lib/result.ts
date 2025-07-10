// TODO: I should really put this somewhere reusable already.


export type Result<T, E> = Ok<T> | Err<E>

export type Ok<T> = {
    isError: false
    value: T
}

export type Err<E> = {
    isError: true
    error: E
}

export const Result = {
    ok: <T>(value: T): Ok<T> => ({ isError: false, value }),
    err: <E>(error: E): Err<E> => ({ isError: true, error }),
    try: async <T>(p: Promise<T>): Promise<Result<T, unknown>> => {
        try {
            return Result.ok(await p)
        } catch (cause) {
            return Result.err(cause)
        }
    },
    trySync: <T>(fn: () => T): Result<T, unknown> => {
        try {
            return Result.ok(fn())
        } catch (cause) {
            return Result.err(cause)
        }
    },
} as const