import { actionCreatorFactory } from 'typescript-fsa'

import { Server, Action, LoguxSubscribeAction } from '..'
import pino = require('pino')

let server = new Server<{ locale: string }>(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    reporter: 'human',
    supports: '1.x',
    logger: pino({ name: 'logux' }),
    root: __dirname
  })
)

class User {
  id: string
  name: string

  constructor (id: string) {
    this.id = id
    this.name = 'name'
  }

  async save (): Promise<void> {}
}

type UserRenameAction = Action & {
  type: 'user/rename'
  userId: string
  name: string
}

type UserSubscribeAction = LoguxSubscribeAction & {
  fields?: ('name' | 'email')[]
}

type UserData = {
  user: User
}

type UserParams = {
  id: string
}

server.type<UserRenameAction, UserData>('user/rename', {
  access (ctx, action, meta) {
    console.log(meta.id)
    ctx.data.user = new User(action.userId)
    return ctx.data.user.id === ctx.userId
  },

  resend (ctx, action) {
    return {
      channels: [`user/${action.userId}`, `spellcheck/${ctx.headers.locale}`]
    }
  },

  async process (ctx, action) {
    ctx.data.user.name = action.name
    await ctx.data.user.save()
  }
})

server.channel<UserParams, UserData, UserSubscribeAction>('user/:id', {
  access (ctx, action, meta) {
    console.log(meta.id, action.since)
    ctx.data.user = new User(ctx.params.id)
    return ctx.data.user.id === ctx.userId
  },
  filter (ctx, action) {
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
  async load (ctx) {
    await ctx.sendBack(
      {
        type: 'user/rename',
        userId: ctx.data.user.id,
        name: ctx.data.user.name
      },
      {
        status: 'processed'
      }
    )
  }
})

server.channel(/admin:\d/, {
  access (ctx, action, meta) {
    console.log(meta.id, action.since)
    return ctx.params[1] === ctx.userId
  }
})

server.on('connected', client => {
  console.log(client.remoteAddress)
})

let createAction = actionCreatorFactory()
let addUser = createAction<{ userId: string }>('user/remove')

server.type(addUser, {
  access (ctx, action) {
    return action.payload.userId === ctx.userId
  }
})
