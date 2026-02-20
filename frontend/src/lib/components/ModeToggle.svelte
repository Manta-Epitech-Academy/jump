<script lang="ts">
	import { Sun, Moon, SunMoon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { setMode, mode, userPrefersMode } from 'mode-watcher';
</script>

<Tooltip.Provider delayDuration={300}>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props: tooltipProps })}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props: menuProps })}
							<Button
								variant="ghost"
								size="icon"
								class="text-inherit hover:bg-white/20 hover:text-inherit"
								{...tooltipProps}
								{...menuProps}
							>
								<div class="relative flex h-full w-full items-center justify-center">
									{#if userPrefersMode.current === 'light'}
										<div class="animate-in duration-200 zoom-in-75">
											<Sun class="h-[1.2rem] w-[1.2rem]" />
										</div>
									{:else if userPrefersMode.current === 'dark'}
										<div class="animate-in duration-200 zoom-in-75">
											<Moon class="h-[1.2rem] w-[1.2rem]" />
										</div>
									{:else}
										<div class="animate-in duration-200 zoom-in-75">
											<SunMoon class="h-[1.2rem] w-[1.2rem]" />
										</div>
									{/if}
								</div>
								<span class="sr-only">Toggle theme</span>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => setMode('light')}>
							<Sun class="mr-2 h-4 w-4" /> Light
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setMode('dark')}>
							<Moon class="mr-2 h-4 w-4" /> Dark
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setMode('system')}>
							<SunMoon class="mr-2 h-4 w-4" /> System
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="bottom">
			<p>
				Thème :
				{#if userPrefersMode.current === 'light'}Clair
				{:else if userPrefersMode.current === 'dark'}Sombre
				{:else}Système ({mode.current === 'dark' ? 'Sombre' : 'Clair'}){/if}
			</p>
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
