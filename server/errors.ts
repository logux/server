import { Server, Action, LoguxSubscribeAction } from '..'

let server = new Server(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    supports: '1.x',
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

  async save (): Promise<void> { }
}

type UserRenameAction = Action & {
  type: 'user/rename',
  userId: string,
  name: string
}

type UserSubscribeAction = LoguxSubscribeAction & {
  fields: ('name' | 'email')[]
}

type UserData = {
  user: User
}

type UserParams = {
  id: string
}

server.type<UserRenameAction, UserData>('user/rename', {
  access (ctx, action) {
    ctx.data.user = new User(action.userId)
    return true
  },

  // THROWS is not assignable to type 'resender
  resend (_, action) {
    return {
      subscriptions: `user/${ action.userId }`
    }
  },

  async process (ctx, action) {
    ctx.data.user.name = action.newName
    // THROWS Property 'admin' does not exist on type 'UserData'.
    await ctx.data.admin.save()
  }
})

// THROWS is not assignable to parameter of type 'ActionCallbacks
server.type('user/changeId', {
  async process (_, action) {
    let user = new User(action.userId)
    user.id = action.newId
    await user.save()
  }
})

// THROWS No overload matches this call.
server.channel<UserParams, UserData, UserSubscribeAction>('user/:id', {
  access () {
    return true
  },
  async filter (_, action) {
    if (action.fields) {
      return (_, otherAction) => {
        return action.fields.includes('name') &&
               otherAction.type === 'user/rename'
      }
    } else {
      return undefined
    }
  },
  async init (ctx) {
    // THROWS is not assignable to parameter of type 'Action'
    await ctx.sendBack({
      userId: ctx.data.user.id,
      name: ctx.data.user.name
    })
  }
})

server.channel(/admin:\d/, {
  access (ctx, action, meta) {
    console.log(meta.id, action.since)
    // THROWS Property 'id' does not exist on type 'string[]'.
    return ctx.params.id === ctx.userId
  }
})
