import { defineAction, type LoguxSubscribeAction } from '@logux/actions'
import pino from 'pino'

import { type Action, Server } from '../index.js'

let server = new Server<{ locale: string }>(
  Server.loadOptions(process, {
    logger: pino({ name: 'logux' }),
    root: '',
    subprotocol: '1.0.0',
    supports: '1.x'
  })
)

server.auth(({ token, userId }) => {
  return token === userId
})

class User {
  id: string
  name: string

  constructor(id: string) {
    this.id = id
    this.name = 'name'
  }

  async save(): Promise<void> {}
}

type UserRenameAction = {
  name: string
  type: 'user/rename'
  userId: string
} & Action

type UserSubscribeAction = {
  fields?: ('email' | 'name')[]
} & LoguxSubscribeAction

type UserData = {
  user: User
}

type UserParams = {
  id: string
}

server.type<UserRenameAction, UserData>('user/rename', {
  access(ctx, action, meta) {
    console.log(meta.id)
    ctx.data.user = new User(action.userId)
    return ctx.data.user.id === ctx.userId
  },

  async process(ctx, action) {
    ctx.data.user.name = action.name
    await ctx.data.user.save()
  },

  resend(ctx, action) {
    return {
      channels: [`user/${action.userId}`, `spellcheck/${ctx.headers.locale}`]
    }
  }
})

server.channel<UserParams, UserData, UserSubscribeAction>('user/:id', {
  access(ctx, action, meta) {
    console.log(meta.id, action.since)
    ctx.data.user = new User(ctx.params.id)
    return ctx.data.user.id === ctx.userId
  },
  filter(ctx, action) {
    return (cxt2, otherAction) => {
      if (typeof action.fields !== 'undefined') {
        return (
          action.fields.includes('name') && otherAction.type === 'user/rename'
        )
      } else {
        return true
      }
    }
  },
  async load(ctx) {
    await ctx.sendBack(
      {
        name: ctx.data.user.name,
        type: 'user/rename',
        userId: ctx.data.user.id
      },
      {
        status: 'processed'
      }
    )
  }
})

server.channel(/admin:\d/, {
  access(ctx, action, meta) {
    console.log(meta.id, action.since)
    return ctx.params[1] === ctx.userId
  }
})

server.on('connected', client => {
  console.log(client.remoteAddress)
})

let addUser = defineAction<{ type: 'user/remove'; userId: string }>(
  'user/remove'
)

server.type(addUser, {
  access(ctx, action) {
    return action.userId === ctx.userId
  }
})
